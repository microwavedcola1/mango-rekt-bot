export interface AssetValue {
  asset_amount: number;
  asset_price: number;
}

export function calculateEmojis(result: AssetValue) {
  if (
    result.asset_amount &&
    result.asset_amount > 0 &&
    result.asset_price &&
    result.asset_price > 0 &&
    result.asset_price * result.asset_amount > 1000
  ) {
    return (
      "🔥".repeat(
        Math.floor(Math.log10(result.asset_amount * result.asset_price)) - 2
      ) + " "
    );
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
