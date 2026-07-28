import MapCard from "./components/map-card";
import SearchBar from "./components/search-bar";

export default function YachtsWrapper() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-natural-50 px-4 py-6 md:px-13.5">
        <SearchBar />
      </div>

      <div className=" w-full md:px-13.5 px-4 py-6">
        <div className="max-w-349  mx-auto grid w-full gap-5 lg:grid-cols-[334px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5">
            <MapCard />
          </aside>
        </div>
      </div>
    </div>
  );
}
