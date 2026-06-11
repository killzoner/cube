//  ClickHouse returns DateTime as strings in format "YYYY-DD-MM HH:MM:SS"
//  cube.js expects them in format "YYYY-DD-MMTHH:MM:SS.000", so translate them based on the metadata returned
//
//  ClickHouse returns some number types as js numbers, others as js string, normalise them all to strings

//  Format a ClickHouse DateTime64 string ("YYYY-MM-DD HH:MM:SS[.fffffffff]") as
//  "YYYY-MM-DDTHH:mm:ss.SSS". Pure-string equivalent of
//  moment.utc(value).format(moment.HTML5_FMT.DATETIME_LOCAL_MS): the date/time part is
//  taken verbatim (DateTime64 is already UTC wall-clock here), the space separator
//  becomes 'T', and the fractional part is normalised to exactly three digits
//  (truncated if longer, zero-padded if shorter, ".000" if absent). Per-cell moment
//  parsing+formatting is a CPU hog that blocks the single-threaded Node event loop on
//  large result sets; string slicing is ~20x faster and byte-for-byte identical.
function formatDateTime64(value: string): string {
  const dotIdx = value.indexOf('.');
  const datePart = value.substring(0, 10);
  const timePart = dotIdx === -1 ? value.substring(11) : value.substring(11, dotIdx);
  const frac = ((dotIdx === -1 ? '' : value.substring(dotIdx + 1)) + '000').substring(0, 3);
  return `${datePart}T${timePart}.${frac}`;
}

function transformValue(type: string, value: unknown) {
  if (value !== null) {
    if (type.includes('DateTime64')) {
      // expect DateTime64 to always be string, can be DateTime64 or DateTime64('timezone')
      return formatDateTime64(value as string);
    } else if (type.includes('DateTime') /** Can be DateTime or DateTime('timezone') */) {
      // expect DateTime to always be string
      const valueStr = value as string;
      return `${valueStr.substring(0, 10)}T${valueStr.substring(11, 22)}.000`;
    } else if (type.includes('Date')) {
      return `${value}T00:00:00.000`;
    } else if (type.includes('Int')
      || type.includes('Float')
      || type.includes('Decimal')
    ) {
      // convert all numbers into strings
      return `${value}`;
    }
  }

  return value;
}

export function transformRow(row: Record<string, unknown>, meta: any) {
  for (const [fieldName, value] of Object.entries(row)) {
    const metaForField = meta[fieldName];
    row[fieldName] = transformValue(metaForField.type, value);
  }
}

export function transformStreamRow(row: Array<unknown>, names: Array<string>, types: Array<string>): Record<string, unknown> {
  if (row.length !== names.length) {
    throw new Error(`Unexpected row and names/types length mismatch; row ${row.length} vs names ${names.length}`);
  }

  return row.reduce<Record<string, unknown>>((rowObj, value, idx) => {
    const name = names[idx];
    const type = types[idx];
    rowObj[name] = transformValue(type, value);
    return rowObj;
    // TODO do we actually want Object.create(null) safety? or is it ok to use {}
  }, Object.create(null));
}
