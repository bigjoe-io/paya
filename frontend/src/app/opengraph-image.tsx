import { ogCard } from "./og";

export const alt = "Paya — buy NEAR with a bank transfer, cash NEAR out to your bank";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogCard("Move money between NEAR and your bank. Both ways.", "usepaya.xyz");
}
