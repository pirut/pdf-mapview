import { Image } from "@shopify/react-native-skia";
import { useImage } from "@shopify/react-native-skia";

import type { NativeTileDescriptor } from "../core/nativeTiles";

export interface TileImageProps {
  tile: NativeTileDescriptor;
}

export function TileImage({ tile }: TileImageProps) {
  const image = useImage(tile.uri ?? null);

  if (!image) {
    return null;
  }

  return (
    <Image
      image={image}
      x={tile.left}
      y={tile.top}
      width={tile.width}
      height={tile.height}
      fit="fill"
    />
  );
}
