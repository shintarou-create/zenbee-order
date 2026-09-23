// カートの sessionStorage キー。live（本番LIFF発注画面）と preview（管理画面の
// 発注画面プレビュー）で別々のキーを使うことで、プレビュー操作が本番カートの
// 内容に影響しないようにする（逆も同様）。
export const CART_STORAGE_KEY_LIVE = 'zenbee_cart'
export const CART_STORAGE_KEY_PREVIEW = 'zenbee_cart_preview'
