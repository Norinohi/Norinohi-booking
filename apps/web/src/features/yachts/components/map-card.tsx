import { Button } from "@yacht-charter/ui/components/actions/button";
import { Search } from "lucide-react";

import { Image } from "@/components/shared/image";

export default function MapCard() {
  return (
    <div className="relative flex h-47.5 items-center justify-center overflow-hidden rounded-2xl border border-border p-6">
      <Image
        src="/assets/yachts/world-map.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 334px, 100vw"
        className="object-cover"
      />
      <Button type="button" variant="neutral" className="relative capitalize ">
        <Search />
        Search by map
      </Button>
    </div>
  );
}
