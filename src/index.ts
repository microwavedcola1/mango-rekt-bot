import {
  Config,
  MangoClient,
  MangoGroup,
  MangoInstructionLayout,
} from "@blockworks-foundation/mango-client";
import {
  Commitment,
  ConfirmedSignatureInfo,
  Connection,
  ParsedConfirmedTransaction,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import axios from "axios";
import { logger } from "./utils";
import {
  parseLiquidateTokenAndPerp,
  parseLiquidateTokenAndToken,
  parseLiquidatePerpMarket,
} from "./parseTransactions";
import { TwitterClient } from "twitter-api-client";

const bs58 = require("bs58");

require("dotenv").config();

const mangoGroupConfig = Config.ids().groups.find(
  (group) => group.name == "mainnet.1"
);
const connection = new Connection(
  process.env.CLUSTER_URL,
  "confirmed" as Commitment
);

let twitterClient: TwitterClient;
if (process.env.TWITTER_API_KEY) {
  twitterClient = new TwitterClient({
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_KEY_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN_KEY,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
}

// not available in ids.json in mango-client, hence curating manually
const baseLotSizeMap: Record<string, number> = {};
async function updateMangoBaseLots() {
  if (!mangoGroupConfig) {
    console.error("Mango group not found!");
    process.exit(1);
  }
  const mangoClient = new MangoClient(
    connection,
    mangoGroupConfig.mangoProgramId
  );

  let mangoGroup: MangoGroup;
  try {
    mangoGroup = await mangoClient.getMangoGroup(mangoGroupConfig.publicKey);
  } catch (e) {
    console.error(e);
  }

  mangoGroupConfig.perpMarkets.forEach((perpMarketConfig) => {
    mangoGroup
      .loadPerpMarket(
        connection,
        perpMarketConfig.marketIndex,
        perpMarketConfig.baseDecimals,
        perpMarketConfig.quoteDecimals
      )
      .then((perpMarket) => {
        baseLotSizeMap[perpMarketConfig.publicKey.toBase58()] =
          perpMarket.baseLotSize.toNumber();
      })
      .catch((e) => {
        console.error(e);
      });
  });
}

function notifierErrorWrapper() {
  notifier().catch((error) => {
    console.error(error);
  });
}

let lastSeenSignature: string = "";
async function notifier() {
  if (!mangoGroupConfig) {
    console.error("Mango group not found!");
    process.exit(1);
  }

  // wait for baseLotSize to be loaded
  while (
    !(
      Object.keys(baseLotSizeMap).length === mangoGroupConfig.perpMarkets.length
    )
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  let signatures: Array<ConfirmedSignatureInfo>;
  try {
    // todo: change to a combination of last seen slot + before
    signatures = await connection.getConfirmedSignaturesForAddress2(
      mangoGroupConfig.publicKey,
      lastSeenSignature ? { until: lastSeenSignature } : {}
    );
    // to find instructions which are rare, we would like to scan backwards
    // signatures = await connection.getConfirmedSignaturesForAddress2(
    //   mangoGroupConfig.publicKey,
    //   lastSeenSignature ? { before: lastSeenSignature } : {},
    // );
  } catch (e) {
    console.error(e);
    return;
  }

  logger.info(`fetched ${signatures.length} signatures`);

  if (!signatures.length) {
    return;
  }

  lastSeenSignature = signatures[0].signature;
  // to find instructions which are rare, we would like to scan backwards
  // lastSeenSignature = signatures[signatures.length - 1].signature;

  logger.info(`lastSeenSignature - ${lastSeenSignature}`);

  // to avoid getting 429'ed by discord, compile all notifications in one batch
  // todo: maybe there is a limit for max characters in a bot, we might hit that
  let combinedNotification = "";
  for (const confirmedSignatureInfo of signatures) {
    if (!confirmedSignatureInfo.signature) {
      continue;
    }

    try {
      const notificationForSignature = await processSignature(
        confirmedSignatureInfo.signature
      );
      if (notificationForSignature) {
        combinedNotification =
          combinedNotification + notificationForSignature + "\n";
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (combinedNotification) {
    axios.post(process.env.WEBHOOK_URL, { content: combinedNotification });
  }
}

export async function processSignature(signature: string): Promise<string> {
  if (!mangoGroupConfig) {
    console.error("Mango group not found!");
    process.exit(1);
  }

  // wait for baseLotSize to be loaded
  while (
    !(
      Object.keys(baseLotSizeMap).length === mangoGroupConfig.perpMarkets.length
    )
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // logger.info(`- processing ${signature}`);
  let confirmedTransaction: ParsedConfirmedTransaction | null;
  try {
    confirmedTransaction = await connection.getParsedConfirmedTransaction(
      signature
    );
  } catch (e) {
    // console.error(e);
    return;
  }

  if (
    !confirmedTransaction ||
    !confirmedTransaction.meta ||
    // dont process errored out transactions
    confirmedTransaction.meta.err
  ) {
    return;
  }

  let combinedNotification = "";
  for (const ix of confirmedTransaction.transaction.message.instructions) {
    if (!(ix as PartiallyDecodedInstruction).data) {
      continue;
    }

    const decodeData = bs58.decode((ix as PartiallyDecodedInstruction).data);
    try {
      let decodedInstruction = MangoInstructionLayout.decode(decodeData, 0);

      let instructionName = Object.keys(decodedInstruction)[0];
      const accounts = (ix as PartiallyDecodedInstruction).accounts.map(
        (account) => account.toString()
      );
      const logMessages = confirmedTransaction?.meta?.logMessages;

      let msg = "";
      if (instructionName === "LiquidateTokenAndPerp") {
        msg = parseLiquidateTokenAndPerp(
          signature,
          logMessages,
          accounts,
          baseLotSizeMap
        );
      } else if (instructionName === "LiquidateTokenAndToken") {
        msg = parseLiquidateTokenAndToken(
          signature,
          logMessages,
          accounts,
          baseLotSizeMap
        );
      } else if (instructionName === "LiquidatePerpMarket") {
        msg = parseLiquidatePerpMarket(
          signature,
          logMessages,
          accounts,
          baseLotSizeMap
        );
      }
      if (msg) {
        logger.info(msg);
        if (process.env.TWITTER_API_KEY) {
          twitterClient.tweets
            .statusesUpdate({
              status: msg,
            })
            .catch((err) => {
              console.error(err);
            });
        }
        combinedNotification = combinedNotification + msg + "\n";
      }
    } catch (e) {
      if (!(e instanceof RangeError) && !(e instanceof TypeError)) {
        {
          console.error(signature);
          console.error(e);
        }
      }
    }
  }
  return combinedNotification;
}

const dayInSeconds = 24 * 60 * 60;
updateMangoBaseLots();
setInterval(updateMangoBaseLots, dayInSeconds * 1000);

////////////////
// kick-off

const thirtySeconds = 1 * 30;
notifierErrorWrapper();
setInterval(notifierErrorWrapper, thirtySeconds * 1000);
