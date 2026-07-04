import { memo } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QRCodeSvgProps {
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  marginSize?: number;
  title?: string;
  className?: string;
  foregroundColor?: string;
  backgroundColor?: string;
}

export const QRCodeSvg = memo(function QRCodeSvg({
  value,
  size = 128,
  level = "L",
  marginSize = 0,
  title,
  className,
  foregroundColor = "#000",
  backgroundColor = "#fff",
}: QRCodeSvgProps) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level={level}
      marginSize={marginSize}
      fgColor={foregroundColor}
      bgColor={backgroundColor}
      {...(title === undefined ? {} : { title })}
      {...(className === undefined ? {} : { className })}
    />
  );
});
