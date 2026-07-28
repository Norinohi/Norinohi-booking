import SearchBar from "./components/search-bar";

export default function YachtsWrapper() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-natural-50 px-4 py-6 md:px-13.5">
        <SearchBar />
      </div>
    </div>
  );
}
