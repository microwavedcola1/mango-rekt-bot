import { processSignature } from "./index";
import { sleep } from "@blockworks-foundation/mango-client";

async function main() {
  // LiquidatePerpMarket
  await processSignature(
    "4uibVribNbszXEGXcWfqckp1WjmQG8P6RAwy8JiLHEMzBa4LKc9aL3pvx7RrHzLGAWe1pE8Yh4TDanLjAM6Fhmq"
  );

  // LiquidateTokenAndToken
  await processSignature(
    "5kthnHBYcaoPABjoP6fXqw3pfZ8WhKHR3zyqqGb3vBKdmhBZ4FhmmMpeg7c21wyQoiyPnebo3b1axxLLfLhX2fkb"
  );

  // LiquidateTokenAndPerp
  await processSignature(
    "29gJP3zuiQfjkW5EQccbMFxNjvTY4PBD2SRrQVPF9J6rJcvGs6ZchHaPR9LCaKbFKLFUN2Thgmm84cXK3knRVMBz"
  );

  process.exit();
}
main();
