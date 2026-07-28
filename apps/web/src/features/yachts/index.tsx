import SearchBar from "./components/search-bar";

export default function YachtsWrapper() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-neutral-50 py-6 px-13.5">
        <SearchBar />
      </div>
    </div>
  );
}
