-- Removes operators' tax registrations and bank accounts from the payloads already stored.
--
-- The sync now drops them before a company record is written, but an unchanged record is only
-- restamped, never rewritten, so every payload stored before that change would keep them until
-- the vendor edited the company. Nothing reads these keys. The source hashes are left alone: they
-- only decide whether the next dump rewrites the record.

update provider_raw_payload rp
set payload = rp.payload - 'vatCode' - 'vatcode' - 'bankAccountNumber' - 'bankAccounts' - 'bankAcounts'
from provider_record r
where r.raw_payload_id = rp.id
  and r.resource_type = 'company'
  and rp.payload ?| array['vatCode', 'vatcode', 'bankAccountNumber', 'bankAccounts', 'bankAcounts'];
