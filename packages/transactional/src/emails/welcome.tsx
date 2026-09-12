/** @jsxImportSource react */
/*
 * WelcomeEmail — the first mail a new account gets, sent once the sign-up itself succeeded.
 * It carries no link that has to work for the account to be usable: the password is already
 * chosen (or the account came in through Google), so this is an orientation mail, not a
 * credential one. That is what separates it from SetPasswordEmail, which goes to someone whose
 * account was opened for them by guest checkout and who still has no way in. Only the card's
 * middle content lives here; the frame comes from EmailLayout and every piece it is drawn with
 * comes from ./_components/ui. Keep exactly one jsx-source annotation in this file.
 */
import * as React from "react";

import { EmailLayout } from "./_components/email-layout";
import {
  ActionButton,
  ActionLink,
  Divider,
  Fact,
  FactList,
  GroupLabel,
  Intro,
  Note,
  SupportLink,
  Title,
} from "./_components/ui";

export type WelcomeEmailProps = {
  /** Absent where sign-up collected no name, which Google sign-in can leave empty. */
  name?: string;
  /** The address the account was opened under, echoed so a typo is visible while it is fixable. */
  email: string;
  /** Where the account lives — the profile page behind the header avatar. */
  profileUrl: string;
  /** The saved-yachts page, the one thing a brand-new account can fill immediately. */
  wishlistUrl: string;
  /**
   * Whether a reply actually reaches anyone. Set by the sender from `REPLY_TO_EMAIL`, because
   * without it the mail goes out under a sending identity that is usually a noreply, and
   * "reply to this email" is then an instruction into a bin.
   */
  replyable: boolean;
  appUrl?: string;
  supportUrl?: string;
};

export function WelcomeEmail({
  name,
  email,
  profileUrl,
  wishlistUrl,
  replyable,
  supportUrl,
  appUrl,
}: WelcomeEmailProps): React.ReactElement {
  return (
    <EmailLayout preview="Your YachtSkanner account is ready" eyebrow="Welcome" appUrl={appUrl}>
      <Title>Welcome aboard</Title>
      <Intro>
        {name ? `${name}, your` : "Your"} YachtSkanner account is ready. Everything you do from here
        — the yachts you save, the enquiries you send, the bookings you make — is kept in one place
        and waiting for you next time you sign in.
      </Intro>

      <GroupLabel>Your account</GroupLabel>
      <FactList>
        <Fact label="Email" value={email} />
      </FactList>

      <ActionButton href={profileUrl}>Open your profile</ActionButton>
      <ActionLink href={wishlistUrl}>See your saved yachts</ActionLink>

      <Divider />
      <Note>
        {replyable
          ? "Not sure where to start, or looking for something specific? Reply to this email and a charter expert will help, or use the link below."
          : "Not sure where to start, or looking for something specific? Use the link below and a charter expert will help."}
      </Note>
      <SupportLink href={supportUrl} />
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = {
  name: "Daria",
  email: "daria@example.com",
  profileUrl: "https://example.com/en/profile",
  wishlistUrl: "https://example.com/en/wishlist",
  replyable: true,
  supportUrl: "https://example.com/en/support",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
