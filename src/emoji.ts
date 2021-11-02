export interface AssetValue {
  asset_amount: number;
  asset_price: number;
}

const EMOJIS = ["🧹", "👻", "🔥", "⚡️", "🧊", "🙏", "💀💣", "🪦🕊", "🙈🙉🙊"];
const STREAKS = [
  "",
  "",
  "",
  "TRIPLE KILL ",
  "MULTI KILL ",
  "RAMPAGE ",
  "KILLING SPREE ",
  "DOMINATING ",
  "UNSTOPPABLE ",
  "MEGA KILL ",
  "ULTRA KILL ",
  "EAGLE EYE ",
  "OWNAGE ",
  "LUDICROUS KILL ",
  "HEAD HUNTER ",
  "WICKED SICK ",
  "MONSTER KILL ",
  "HOLY SHIT ",
  "G O D L I K E ",
];

export function calculateEmojis(result: AssetValue) {
  if (
    result.asset_amount &&
    result.asset_amount > 0 &&
    result.asset_price &&
    result.asset_price > 0
  ) {
    const usdValue = result.asset_amount * result.asset_price;
    // 1024 = level 1
    const level = Math.max(Math.floor(Math.log2(usdValue)) - 9, 0);
    if (level > 0) {
      const streak = STREAKS[level];
      const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      const emojiLevel = randomEmoji.repeat(
        Math.min(level, Math.floor(20 / randomEmoji.length))
      );

      return `${streak}${emojiLevel} `;
    }
  }

  return "";
}

// console.log(
//   calculateEmojis({
//     asset_amount: 0.1,
//     asset_price: 0.1,
//   } as AssetValue)
// );
// console.log(
//   calculateEmojis({
//     asset_amount: 0.1,
//     asset_price: 1,
//   } as AssetValue)
// );
// console.log(
//   calculateEmojis({
//     asset_amount: 1,
//     asset_price: 10,
//   } as AssetValue)
// );
// console.log(
//   calculateEmojis({
//     asset_amount: 1,
//     asset_price: 100,
//   } as AssetValue)
// );
// console.log(
//   calculateEmojis({
//     asset_amount: 1,
//     asset_price: 1000,
//   } as AssetValue)
// );
// console.log(
//   calculateEmojis({
//     asset_amount: 1,
//     asset_price: 10000,
//   } as AssetValue)
// );
