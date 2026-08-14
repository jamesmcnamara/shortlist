handle watched via API

UI
sign in card not centered vertically on mobile
some sort of visual indicator when you vote
removing a vote crashes

rooms
leave-a-room flow for members (admins can remove, but you cannot let yourself out)
surface pending invites in the UI, not just by URL
vote/nomination caps are enforced by a guarded INSERT, which narrows but does
not close the race under READ COMMITTED. Needs a row lock in a transaction
to be exact, which the neon-http driver cannot hold across statements.
