"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import deactivateIllustration from "../assets/deactivate-account.png";

/*
 * ProfileForm — Figma "Your Profile" (972:54538 desktop / 972:70725 tablet / 972:70921 mobile).
 * Card: titled header + a 2-column field grid (First/Last, Email/Phone), a masked password row
 * with a "Change Password" action, then the Save / Deactivate actions.
 * better-auth stores only name + email today, so first/last are split from `name` and phone is
 * UI-only; Change Password and Deactivate are placeholders until their flows exist.
 */

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Invalid email address"),
  phone: z.string(),
});

type Values = z.infer<typeof schema>;

function splitName(full: string) {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

export default function ProfileForm({
  user,
  onSaved,
}: {
  user: { name: string; email: string };
  onSaved?: () => void;
}) {
  const t = useTranslations("Profile");
  const { firstName, lastName } = splitName(user.name);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { firstName, lastName, email: user.email, phone: "" },
    mode: "onTouched",
  });

  // TODO: persist via authClient.updateUser once first/last/phone have backing columns.
  // Success is surfaced as the top banner owned by ProfileScreen, per the design.
  const onSubmit = (_values: Values) => {
    onSaved?.();
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        {/* Title */}
        <div className="border-b border-border px-5 py-5">
          <h1 className="text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h1>
        </div>

        {/* Fields — 16px row/column gaps, 20px padding (Figma 972:54552) */}
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("firstName")}</FormLabel>
                  <FormControl>
                    <TextField autoComplete="given-name" className="leading-[1.25]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("lastName")}</FormLabel>
                  <FormControl>
                    <TextField autoComplete="family-name" className="leading-[1.25]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("email")}</FormLabel>
                  <FormControl>
                    <TextField
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className="leading-[1.25]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("phone")}</FormLabel>
                  <FormControl>
                    <TextField
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      className="leading-[1.25]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Password (masked, non-editable) + Change Password */}
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2 md:items-end">
            <TextField
              label={t("password")}
              type="password"
              defaultValue="password12"
              readOnly
              autoComplete="off"
              className="leading-[1.25]"
            />
            <div className="flex">
              <Button
                type="button"
                variant="neutral"
                size="md"
                className="w-full md:w-auto"
                onClick={() => toast.info(t("changePasswordSoon"))}
              >
                {t("changePassword")}
              </Button>
            </div>
          </div>
        </div>

        {/* Actions — own section split by a separator (Figma 972:54562/54563) */}
        <div className="flex flex-col gap-4 border-t border-border p-5 sm:flex-row">
          <Button type="submit" variant="brand" size="md" className="w-full sm:w-auto">
            {t("save")}
          </Button>

          <Dialog>
            <DialogTrigger
              render={
                <Button type="button" variant="destructive" size="md" className="w-full sm:w-auto">
                  {t("deactivate")}
                </Button>
              }
            />
            <DialogContent showClose mobileSheet>
              <img src={deactivateIllustration.src} alt="" className="size-[70px]" />
              <DialogHeader>
                <DialogTitle>{t("deactivateTitle")}</DialogTitle>
                <DialogDescription>{t("deactivateDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      size="md"
                      // TODO: wire real deactivation once the flow/backend exists.
                      onClick={() => toast.info(t("deactivateSoon"))}
                    >
                      {t("deactivate")}
                    </Button>
                  }
                />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </form>
    </Form>
  );
}
