-- Daily App, migration 0004: official market dates for late 2026 and 2027.
-- Copied from the official calendars (checked 2026-10-11). Update once a year with the new lists.
--   FOMC (Fed):  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm  (statement 14:00 New York, day 2;
--                dates are tentative until confirmed at the previous meeting)
--   ECB:         https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html (decision 14:15 Frankfurt, day 2)
--   US CPI:      https://www.bls.gov/schedule/news_release/cpi.htm     (08:30 New York)
--   US jobs:     https://www.bls.gov/schedule/news_release/empsit.htm  (08:30 New York)
--
-- How to apply: Supabase → SQL Editor → New query → paste this file → Run. Safe to run twice.

insert into daily.market_events (starts_at, title, importance, region, source, source_url)
select (d || ' ' || t)::timestamp at time zone tz, title, importance, region, source, url
from (values
  -- FOMC rate decisions (day 2)
  ('2026-10-28', '14:00', 'America/New_York', 'Fed-Zinsentscheid', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2026-12-09', '14:00', 'America/New_York', 'Fed-Zinsentscheid mit Projektionen', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-01-27', '14:00', 'America/New_York', 'Fed-Zinsentscheid', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-03-17', '14:00', 'America/New_York', 'Fed-Zinsentscheid mit Projektionen', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-04-28', '14:00', 'America/New_York', 'Fed-Zinsentscheid', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-06-09', '14:00', 'America/New_York', 'Fed-Zinsentscheid mit Projektionen', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-07-28', '14:00', 'America/New_York', 'Fed-Zinsentscheid', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-09-15', '14:00', 'America/New_York', 'Fed-Zinsentscheid mit Projektionen', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-10-27', '14:00', 'America/New_York', 'Fed-Zinsentscheid', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  ('2027-12-08', '14:00', 'America/New_York', 'Fed-Zinsentscheid mit Projektionen', 5, 'US', 'Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  -- ECB monetary policy decisions (day 2)
  ('2026-10-29', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2026-12-17', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-02-04', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-03-18', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-04-29', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-06-10', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-07-22', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-09-09', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-10-28', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  ('2027-12-16', '14:15', 'Europe/Berlin', 'EZB-Zinsentscheid', 5, 'EU', 'EZB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'),
  -- US consumer prices (CPI)
  ('2026-11-10', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2026-12-10', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-01-13', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-02-11', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-03-10', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-04-13', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-05-12', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-06-10', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-07-14', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-08-11', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-09-14', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-10-14', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-11-10', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  ('2027-12-10', '08:30', 'America/New_York', 'US-Inflationsdaten (CPI)', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/cpi.htm'),
  -- US labour market (Employment Situation)
  ('2026-11-06', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2026-12-04', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-01-08', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-02-05', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-03-05', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-04-02', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-05-07', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-06-04', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-07-02', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-08-06', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-09-03', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-10-08', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-11-05', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm'),
  ('2027-12-03', '08:30', 'America/New_York', 'US-Arbeitsmarktbericht', 4, 'US', 'U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/empsit.htm')
) as v (d, t, tz, title, importance, region, source, url)
on conflict (source, starts_at, title) do nothing;

insert into daily.schema_migrations (version) values ('0004_market_events_2026_2027') on conflict do nothing;
