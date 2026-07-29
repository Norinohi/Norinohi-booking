import EmptyState from "@/components/shared/empty-state";
import Sidebar from "@/components/layout/sidebar";

/*
 * Dev-only kitchen-sink for app sections that don't live in Storybook.
 * Global chrome (NavigationBar + Footer) is already visible on every route.
 */
export default function PreviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 p-6 md:p-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-h5">Sections preview</h1>
        <p className="text-body-s text-muted-foreground">
          Dev surface for reusable app sections (not in Storybook).
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-h6">Sidebar</h2>
        <div className="flex flex-wrap gap-6">
          <Sidebar variant="user" name="John Doe" />
          <Sidebar variant="admin" name="John Doe" defaultActive="discount" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h6">Empty state</h2>
        <div className="rounded-lg border border-border">
          <EmptyState />
        </div>
      </section>
    </main>
  );
}
