import { PhotosView } from "@/components/PhotosView";
import { visionEnabled } from "@/lib/photos/vision";

export default function Photos() {
  return <PhotosView vision={visionEnabled()} />;
}
