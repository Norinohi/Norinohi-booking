import HistoryLayout, { type HistoryLayoutProps } from "./history-layout";
import MapLayout, { type MapLayoutProps } from "./map-layout";
import RowLayout, { type RowLayoutProps } from "./row-layout";
import TileLayout, { type TileLayoutProps } from "./tile-layout";

export interface YachtRowCardProps extends Omit<RowLayoutProps, "summary" | "summaryAction"> {
  /** The catalogue result: photos, details, and dates with the price and action. */
  layout: "row";
}

export interface YachtSummaryCardProps extends Omit<RowLayoutProps, "summary" | "footer"> {
  /** The booking flow's recap of the boat: the `row` card without its price column. */
  layout: "summary";
}

export type YachtMapCardProps = MapLayoutProps;

export interface YachtHistoryCardProps extends HistoryLayoutProps {
  /** My Bookings from xl: one info column and the booking's own actions. */
  layout: "history";
}

export interface YachtTileCardProps extends TileLayoutProps {
  /** The carousel tile: one photo and one price line. */
  layout: "tile";
}

export type YachtCardProps =
  | YachtRowCardProps
  | YachtSummaryCardProps
  | YachtMapCardProps
  | YachtHistoryCardProps
  | YachtTileCardProps;

/**
 * Every listing card on the site, one per `layout`. The layouts are composed from the same parts
 * (`./parts`) and fed by the same view model (`./view-model`), so a boat reads the same wherever it
 * appears and a new breakpoint is designed in one place.
 */
export default function YachtCard(props: YachtCardProps) {
  switch (props.layout) {
    case "row":
      return <RowLayout {...props} summary={false} />;
    case "summary":
      return <RowLayout {...props} summary />;
    case "compact":
    case "popup":
      return <MapLayout {...props} />;
    case "history":
      return <HistoryLayout {...props} />;
    case "tile":
      return <TileLayout {...props} />;
  }
}
