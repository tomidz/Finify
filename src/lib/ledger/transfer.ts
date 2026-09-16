export type LedgerLine = {
  account_id: string;
  amount: number;
  exchange_rate: number;
  base_amount: number;
};

type TransferAccount = { id: string; currency: string };

/** Which rates to base currency buildTransferLines needs looked up. */
export function transferRatesNeeded(input: {
  source: TransferAccount;
  destination: TransferAccount;
  baseCurrency: string;
}): { source: boolean; destination: boolean } {
  return {
    source: input.source.currency !== input.baseCurrency,
    destination:
      input.destination.currency !== input.baseCurrency &&
      input.destination.currency !== input.source.currency,
  };
}

/**
 * The two legs of a transfer. The source is debited the transfer plus the fee
 * in its currency; the destination is credited the converted amount. Each
 * leg's base amount is in the user's base currency: a same-currency
 * destination takes its share of the source's base value, so the fee is the
 * only difference between the legs.
 *
 * `rates` are to the base currency, and only those transferRatesNeeded asks
 * for are read.
 */
export function buildTransferLines(input: {
  source: TransferAccount;
  destination: TransferAccount;
  baseCurrency: string;
  sourceAmount: number;
  destinationAmount: number;
  exchangeRate: number;
  fee: number;
  rates: { source?: number; destination?: number };
}): LedgerLine[] {
  const transferAbsolute = Math.abs(input.sourceAmount);
  const sourceDebit = transferAbsolute + Math.max(0, input.fee);
  const destinationAbsolute = Math.abs(input.destinationAmount);
  const needed = transferRatesNeeded(input);

  const sourceBase = needed.source ? sourceDebit * rateOf(input.rates.source) : sourceDebit;

  let destinationBase: number;
  if (input.destination.currency === input.baseCurrency) {
    destinationBase = destinationAbsolute;
  } else if (input.destination.currency === input.source.currency) {
    destinationBase = (sourceBase * transferAbsolute) / sourceDebit;
  } else {
    destinationBase = destinationAbsolute * rateOf(input.rates.destination);
  }

  return [
    {
      account_id: input.source.id,
      amount: -sourceDebit,
      exchange_rate: input.exchangeRate,
      base_amount: -Math.abs(sourceBase),
    },
    {
      account_id: input.destination.id,
      amount: destinationAbsolute,
      exchange_rate: input.exchangeRate,
      base_amount: Math.abs(destinationBase),
    },
  ];
}

function rateOf(rate: number | undefined): number {
  if (rate == null) throw new Error("buildTransferLines: missing rate to base currency");
  return rate;
}
