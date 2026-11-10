/*
# Link gift transactions to review queue entries

Plain-English summary:
Each validated gift can now record which review it upgraded. Gifts that arrive before a viewer submits a review are kept as pending priority and applied to their next review.

1. Modified Tables
- `gift_transactions`: new nullable column `review_queue_id` pointing at the review queue entry the gift was applied to.

2. Security
- No policy or grant changes. The column inherits the existing table policies.

Important notes
1. The column is added only if it does not already exist, so the migration is safe to re-run.
2. Existing gift rows keep a null value, meaning they are still pending priority.
*/

ALTER TABLE gift_transactions
  ADD COLUMN IF NOT EXISTS review_queue_id uuid REFERENCES review_queue(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gift_transactions_pending_idx ON gift_transactions (user_id) WHERE review_queue_id IS NULL;
