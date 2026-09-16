/**
 * What a NUMERIC column with `scale` decimals stores for `value`. PostgREST
 * hands Postgres the JSON text of the number (its shortest round-trip form)
 * and Postgres rounds that decimal half away from zero; rounding the binary
 * value instead (toFixed) can land one unit of the last decimal apart.
 */
export function roundLikeNumeric(value: number, scale: number): number {
  if (!Number.isFinite(value)) return value;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(value));
  if (!match) return value;
  const [, sign, integer, fraction = "", exponent = "0"] = match;

  // value = digits × 10^-decimals
  const digits = BigInt(integer + fraction);
  const decimals = fraction.length - Number(exponent);
  if (decimals <= scale) return value;

  const divisor = BigInt(`1${"0".repeat(decimals - scale)}`);
  let rounded = digits / divisor;
  if ((digits % divisor) * BigInt(2) >= divisor) rounded += BigInt(1);
  if (rounded === BigInt(0)) return 0;
  return Number(`${sign}${rounded}e-${scale}`);
}
