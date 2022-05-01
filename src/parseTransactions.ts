import { AssetType, I80F48, IDS } from "@blockworks-foundation/mango-client";
import * as anchor from "@project-serum/anchor";
import type BN from "bn.js";
import idl from "./idl.json";
import { logger } from "./utils";

// @ts-ignore
const coder = new anchor.BorshCoder(idl);

/* tslint:disable */

// Unfortunately ids.json does not correspond to the token indexes in the log - so keep a map here for reference
// mango group -> token index -> mint key
// TODO: is there a better way?
var tokenIndexesMap = {
  "98pjRuQjK3qA6gXts96PqZT4Ze5QmnCmt3QYjhbUSPue": {
    0: "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
    1: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    2: "2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk",
    3: "So11111111111111111111111111111111111111112",
    4: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    5: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
    6: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    7: "8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh",
    8: "AGFEad2et2ZJif9jaGpdMixQqvW5i81aBdvKe7PHNfz3",
    10: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    11: "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa",
    12: "KgV1GvrHQmRBY8sHQQeUKwTm2r2h8t4C8qt12Cw1HVE",
    13: "F6v4wfAdJB8D8p77bMXZgYt8TDKsYxLYxH5AFhUkYx9W",
    15: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  "4yJ2Vx3kZnmHTNCrHzdoj5nCwriF2kVhfKNvqC6gU8tr": {
    0: "MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac",
    1: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    2: "2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk",
    3: "So11111111111111111111111111111111111111112",
    4: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
    5: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    15: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
};

var ids = IDS;

const minUSDValue = 100;

export function parseEventsFromLogMessages(logMessages: string[]) {
  const parsedEvents = [];
  let idx = 0;
  while (idx < logMessages.length - 1) {
    if (
      logMessages[idx] === "Program log: mango-log" &&
      logMessages[idx + 1].includes("Program data")
    ) {
      try {
        const evenLogMessage = logMessages[idx + 1].replace(
          "Program data: ",
          ""
        );
        const x = coder.events.decode(evenLogMessage);
        parsedEvents.push(x);
      } catch (e) {
        console.error(e);
      }
    }
    idx = idx + 2;
  }
  return parsedEvents;
}

// transfers quote and base position from liqee to liqor
export function parseLiquidatePerpMarket(
  signature: string,
  logMessages: any,
  accounts: any,
  baseLotSizeMap: any
): string {
  if (logMessages.includes("Program log: Account init_health above zero.")) {
    return undefined;
  }
  let mangoGroupPk = accounts[0];
  let liqee = accounts[4];
  let liqor = accounts[5];

  let perpMarkets = ids["groups"].find((e) => e["publicKey"] === mangoGroupPk)![
    "perpMarkets"
  ];
  let quoteSymbol = ids["groups"].find((e) => e["publicKey"] === mangoGroupPk)![
    "quoteSymbol"
  ];

  let perpMarketName;
  let liabSymbol;
  let assetSymbol;
  let baseTransfer;
  let quoteTransfer;
  let bankruptcy;
  let price;

  const eventsLogMessages = parseEventsFromLogMessages(logMessages);
  const filteredEventsLogMessages = eventsLogMessages.filter(
    (event) => event.name === "LiquidatePerpMarketLog"
  );
  if (filteredEventsLogMessages.length === 0) {
    return undefined;
  } else {
    const event: {
      marketIndex: BN;
      price: BN;
      baseTransfer: BN;
      quoteTransfer: BN;
      bankruptcy: boolean;
    } = filteredEventsLogMessages[0].data as any;

    let perpMarket = perpMarkets.find(
      (e) => e.marketIndex === event.marketIndex.toNumber()
    )!;
    perpMarketName = perpMarket.name;
    liabSymbol = perpMarket.baseSymbol;
    assetSymbol = quoteSymbol;
    const baseLotSize = baseLotSizeMap[perpMarket.publicKey.toString()];

    if (baseLotSize === 0) {
      return undefined;
    }

    baseTransfer =
      (event.baseTransfer.toNumber() * baseLotSize) /
      Math.pow(10, perpMarket.baseDecimals);
    quoteTransfer =
      new I80F48(event.quoteTransfer).toNumber() /
      Math.pow(10, perpMarket.quoteDecimals);
    bankruptcy = event.bankruptcy;
    price =
      new I80F48(event.price).toNumber() *
      Math.pow(10, perpMarket.baseDecimals - perpMarket.quoteDecimals);
  }

  const result = {
    liqor: liqor,
    liqee: liqee,
    perp_market: perpMarketName,
    liab_symbol: liabSymbol,
    liab_amount: baseTransfer,
    asset_symbol: assetSymbol,
    asset_amount: quoteTransfer,
    bankruptcy: bankruptcy,
    mango_group: mangoGroupPk,
  } as LiquidatePerpMarketResult;
  // logger.info(JSON.stringify(result, null, '\t'));

  // (LiquidatePerpMarket) Liquidated SHORT on SOL-PERP: 0.0000146,
  // https://explorer.solana.com/tx/39nzSPvGS4kGs8tdciGNhFnL4ByYmxD8bCubFr56BC3u1KcsLttWHXSQiCZfmYUxe8HUSXxA33hamejYQqpQs5Qa
  // {
  // 	"liqor": "3Ubpojkfd6VvM1w3k7QutocRPpaJ9RYQpFXNo5eJdobt",
  // 	"liqee": "9zBed2VuJGo1qfkTFSdguUa4hysSZonPGYkie2bPyC1P",
  // 	"perp_market": "SOL-PERP",
  // 	"liab_symbol": "SOL",
  // 	"liab_amount": -0.0000146,
  // 	"asset_symbol": "USDC",
  // 	"asset_amount": 0.0023164585836449644,
  // 	"bankruptcy": false,
  // 	"mango_group": "98pjRuQjK3qA6gXts96PqZT4Ze5QmnCmt3QYjhbUSPue"
  // }
  //
  // Since account health for liqee is negative, exchanged and transferred quote position worth
  // 0.0023164585836449644 USDC to liquee from liqor for 0.0000146 SOL of SOL-PERP SHORT position.
  //
  // USDC was chosen to be deposited into liqee since the perp quote positions are in USDC so borrows
  // are implicitly in USDC, and perp position was reduced.

  // OLD style message
  if (result.asset_amount * price > minUSDValue) {
    const oldStyleMsg = `Liquidated ${Math.abs(result.liab_amount).toFixed(
      4
    )} ${result.liab_symbol} on ${result.perp_market} ${
      result.liab_amount > 0 ? "LONG" : "SHORT"
    }, https://trade.mango.markets/account?pubkey=${liqee}`;
    logger.info(oldStyleMsg);
  }

  // NEW style message
  if (Math.abs(result.liab_amount * price) > minUSDValue) {
    return `Liquidated ${result.liab_amount > 0 ? "LONG" : "SHORT"} ${Math.abs(
      result.liab_amount
    ).toLocaleString(undefined, {
      maximumSignificantDigits: 5,
    })} ${result.perp_market} ($${Math.abs(result.asset_amount).toLocaleString(
      undefined,
      {
        maximumFractionDigits: 2,
      }
    )}), https://trade.mango.markets/account?pubkey=${liqee}`;
  }

  return "";
}
export interface LiquidatePerpMarketResult {
  liqor: string;
  liqee: string;
  perp_market: string;
  liab_symbol: string;
  liab_amount: number;
  asset_symbol: string;
  asset_amount: number;
  bankruptcy: boolean;
  mango_group: string;
}

// transfer asset to liqor and liab to liqee
export function parseLiquidateTokenAndPerp(
  signature: string,
  logMessages: any,
  accounts: any,
  baseLotSizeMap: any
): string {
  if (logMessages.includes("Program log: Account init_health above zero.")) {
    return undefined;
  }

  let mangoGroupPk = accounts[0];
  let liqee = accounts[2];
  let liqor = accounts[3];

  let tokens = ids["groups"].find((e) => e["publicKey"] === mangoGroupPk)![
    "tokens"
  ];
  let perpMarkets = ids["groups"].find((e) => e["publicKey"] === mangoGroupPk)![
    "perpMarkets"
  ];

  let quoteSymbol = ids["groups"].find((e) => e["publicKey"] === mangoGroupPk)![
    "quoteSymbol"
  ];
  let quoteDecimals = ids["groups"]
    .find((e) => e["publicKey"] === mangoGroupPk)!
    ["tokens"].find((e) => e.symbol === quoteSymbol)!.decimals;

  let perpMarket;
  let assetSymbol;
  let liabSymbol;
  let assetType;
  let liabType;
  let assetTransfer;
  let assetPrice;
  let liabTransfer;
  let liabPrice;
  let assetDecimals;
  let liabDecimals;

  const eventsLogMessages = parseEventsFromLogMessages(logMessages);
  const filteredEventsLogMessages = eventsLogMessages.filter(
    (event) => event.name === "LiquidateTokenAndPerpLog"
  );
  if (filteredEventsLogMessages.length === 0) {
    return undefined;
  } else {
    const event: {
      assetIndex: BN;
      liabIndex: BN;
      assetType: AssetType;
      liabType: AssetType;
      assetPrice: BN;
      liabPrice: BN;
      assetTransfer: BN;
      liabTransfer: BN;
      bankruptcy: boolean;
    } = filteredEventsLogMessages[0].data as any;

    if (assetType === "Token") {
      // asset is token and liab is perp
      let assetTokenPk = (tokenIndexesMap as any)[mangoGroupPk][
        event.assetIndex.toNumber()
      ];
      let assetToken = tokens.find((e) => e["mintKey"] === assetTokenPk)!;
      assetSymbol = assetToken.symbol;
      assetDecimals = assetToken.decimals;

      let liabPerpMarket = perpMarkets.find(
        (e) => event.assetIndex.toNumber() === event.liabIndex.toNumber()
      );
      // Liquidation can only occur on quote position on perp side
      // So I'll set the asset symbol to the quote symbol (as that is what is transferred)
      liabSymbol = quoteSymbol;
      liabDecimals = liabPerpMarket!.quoteDecimals;
      perpMarket = liabPerpMarket!.name;
    } else {
      // asset is perp and liab is token
      let assetPerpMarket = perpMarkets.find(
        (e) => e.marketIndex === event.assetIndex.toNumber()
      );
      // Liquidation can only occur on quote position on perp side
      // So I'll set the asset symbol to the quote symbol (as that is what is transferred)
      assetSymbol = quoteSymbol;
      assetDecimals = assetPerpMarket!.quoteDecimals;
      perpMarket = assetPerpMarket!.name;

      let liabTokenPk = (tokenIndexesMap as any)[mangoGroupPk][
        event.liabIndex.toNumber()
      ];
      let liabToken = tokens.find((e) => e.mintKey === liabTokenPk);
      liabSymbol = liabToken!.symbol;
      liabDecimals = liabToken!.decimals;
    }

    assetTransfer =
      new I80F48(event.assetTransfer).toNumber() / Math.pow(10, assetDecimals);
    assetPrice =
      new I80F48(event.assetPrice).toNumber() *
      Math.pow(10, assetDecimals - quoteDecimals);

    liabTransfer =
      new I80F48(event.liabTransfer).toNumber() / Math.pow(10, liabDecimals);
    liabPrice =
      new I80F48(event.liabPrice).toNumber() *
      Math.pow(10, liabDecimals - quoteDecimals);
  }

  const result = {
    liqor: liqor,
    liqee: liqee,
    perp_market: perpMarket,
    liab_symbol: liabSymbol,
    liab_amount: liabTransfer,
    liab_price: liabPrice,
    liab_type: liabType,
    asset_symbol: assetSymbol,
    asset_amount: assetTransfer,
    asset_price: assetPrice,
    asset_type: assetType,
    mango_group: mangoGroupPk,
  } as LiquidateTokenAndPerpResult;

  // logger.info(JSON.stringify(result, null, '\t'));

  // (LiquidateTokenAndPerp) Liquidated 2.207542944426932 USDC as collateral for LONG on BTC-PERP,
  //  https://explorer.solana.com/tx/4d689iVim1PKGFbJvQVq3z1QwtBADrm8TjBbZRCAzCWrY4hszgurFJm8fNeiq9KFZvCA1gFWDWWRGCvnrrNE3EUF
  // {
  // 	"liqor": "EwpG3GZvmei2xjfdc6Nmn4JjJhsTtP5wQBnfHeS1MpU1",
  // 	"liqee": "Hz8Kc8ZqoR1kj1hiTkAHjZNGZFNE4xbaiYPJ7QmkNzLQ",
  // 	"perp_market": "BTC-PERP",
  // 	"liab_symbol": "USDC",
  // 	"liab_amount": 2.207542944426932,
  // 	"liab_price": 1,
  // 	"liab_type": "Perp",
  // 	"asset_symbol": "SOL",
  // 	"asset_amount": 0.01940138529032923,
  // 	"asset_price": 119.47188599999947,
  // 	"asset_type": "Token",
  // 	"mango_group": "98pjRuQjK3qA6gXts96PqZT4Ze5QmnCmt3QYjhbUSPue"
  // }
  //
  // Since account health for liqee is negative, exchanged and transferred 2.207542944426932 USDC
  //  to liquee from liqor for 0.01940138529032923 SOL at a price of 119.47188599999947 USDC
  //  (value of 2.37).
  //
  // USDC was chosen to be deposited into liqee since he perp quote positions are in USDC so borrows
  // are implicitly in USDC, and SOL was chosen as asset since he had
  // the highest net for SOL
  //
  // User has base position of 0 on perp market, hence we cant reduce his perp position further

  if (result.asset_amount * result.asset_price > minUSDValue) {
    return `Liquidated ${result.asset_amount.toFixed(4)} ${
      result.asset_symbol
    } on ${result.perp_market} ${
      result.liab_amount > 0 ? "LONG" : "SHORT"
    }, https://trade.mango.markets/account?pubkey=${liqee}`;
  }
  return "";
}

export interface LiquidateTokenAndPerpResult {
  liqor: string;
  liqee: string;
  perp_market: string;
  liab_symbol: string;
  liab_amount: number;
  liab_price: number;
  liab_type: string;
  asset_symbol: string;
  asset_amount: number;
  asset_price: number;
  asset_type: string;
  mango_group: string;
}

export function parseLiquidateTokenAndToken(
  signature: string,
  logMessages: any,
  accounts: any,
  baseLotSizeMap: any
): string {
  if (logMessages.includes("Program log: Account init_health above zero.")) {
    return undefined;
  }

  let mangoGroup = accounts[0];
  let liqee = accounts[2];
  let liqor = accounts[3];
  let assetRootPk = accounts[5];
  let liabRootPk = accounts[7];

  let assetToken = ids["groups"]
    .find((e) => e["publicKey"] === mangoGroup)!
    ["tokens"].find((e) => e.rootKey === assetRootPk)!;
  let liabToken = ids["groups"]
    .find((e) => e["publicKey"] === mangoGroup)!
    ["tokens"].find((e) => e.rootKey === liabRootPk)!;

  let quoteSymbol = ids["groups"].find((e) => e["publicKey"] === mangoGroup)![
    "quoteSymbol"
  ];
  let quoteDecimals = ids["groups"]
    .find((e) => e["publicKey"] === mangoGroup)!
    ["tokens"].find((e) => e.symbol === quoteSymbol)!.decimals;

  let assetPrice;
  let liabPrice;
  let assetTransfer;
  let liabTransfer;
  let bankruptcy;

  const eventsLogMessages = parseEventsFromLogMessages(logMessages);
  const filteredEventsLogMessages = eventsLogMessages.filter(
    (event) => event.name === "LiquidateTokenAndTokenLog"
  );
  if (filteredEventsLogMessages.length === 0) {
    return undefined;
  } else {
    const event: {
      assetTransfer: BN;
      liabTransfer: BN;
      assetPrice: BN;
      liabPrice: BN;
      bankruptcy: boolean;
    } = filteredEventsLogMessages[0].data as any;
    assetPrice =
      new I80F48(event.assetPrice).toNumber() *
      Math.pow(10, assetToken.decimals - quoteDecimals);
    liabPrice =
      new I80F48(event.liabPrice).toNumber() *
      Math.pow(10, liabToken.decimals - quoteDecimals);
    assetTransfer =
      new I80F48(event.assetTransfer).toNumber() /
      Math.pow(10, assetToken.decimals);
    liabTransfer =
      new I80F48(event.liabTransfer).toNumber() /
      Math.pow(10, liabToken.decimals);
    bankruptcy = event.bankruptcy;
  }

  const result = {
    liqor: liqor,
    liqee: liqee,
    liab_symbol: liabToken.symbol,
    liab_amount: liabTransfer,
    liab_price: liabPrice,
    asset_symbol: assetToken.symbol,
    asset_amount: assetTransfer,
    asset_price: assetPrice,
    bankruptcy: bankruptcy,
    mango_group: mangoGroup,
  } as LiquidateTokenAndTokenResult;

  // logger.info(JSON.stringify(result, null, '\t'))

  // e.g.
  // (LiquidateTokenAndToken) Liquidated borrow on USDC: 7214.591563 at 1 USDC,
  // https://explorer.solana.com/tx/3UV6iiBBjsLZAFpJBCxaveFby2hQ4NURcvWqcNNV3JL6s46hh1pPniGw9WLvFthtYsZWerC7NqNYLXEvegiNTowT
  //
  // {
  // 	"liqor": "3CdkRpddEAYN8XHnLFtGEtfFAxjD2jUK5h53ANJBoq3D",
  // 	"liqee": "6xc8DWdt2StJJkytWc9vuGqQeszFVow5zUdsiuUWJ3T1",
  // 	"liab_symbol": "USDC",
  // 	"liab_amount": 7214.591563,
  // 	"liab_price": 1,
  // 	"asset_symbol": "SOL",
  // 	"asset_amount": 45.513937219637135,
  // 	"asset_price": 166.4395919999997,
  // 	"bankruptcy": false,
  // 	"mango_group": "98pjRuQjK3qA6gXts96PqZT4Ze5QmnCmt3QYjhbUSPue"
  // }
  //
  // Since account health for liqee is negative, exchanged and transferred 7214.591563 USDC
  //  to liquee from liqor for 45.513937219637135 SOL at a price of 166.4395919999997 USDC
  //  (value of 7575.32).
  //
  // USDC was chosen to be deposited into liqee since he had the lowest net
  // (can also be thought of as higest borrow) for USDC
  //

  if (result.asset_amount * result.asset_price > minUSDValue) {
    return `Liquidated ${result.liab_amount.toFixed(4)} ${
      result.liab_symbol
    } borrow with ${result.asset_amount.toFixed(4)} ${
      result.asset_symbol
    }, https://trade.mango.markets/account?pubkey=${liqee}`;
  }
  return "";
}

export interface LiquidateTokenAndTokenResult {
  liqor: string;
  liqee: string;
  liab_symbol: string;
  liab_amount: number;
  liab_price: number;
  asset_symbol: string;
  asset_amount: number;
  asset_price: number;
  bankruptcy: boolean;
  mango_group: string;
}
