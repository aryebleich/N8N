-- =====================================================================
-- Oracle Autonomous Database: read-only ORDS API for the support workflow
--
-- What this script does
--   PART 1 (run as ADMIN)
--     1. Creates demo source tables in the application schema IF they do
--        not exist yet (skip-safe: your real tables are never touched).
--     2. Creates three views that expose only support-safe columns
--        (no card numbers, no payment tokens, no free-text ticket notes).
--     3. Creates SUPPORT_RO, a read-only user with CREATE SESSION and
--        SELECT on those three views. Nothing else.
--     4. REST-enables SUPPORT_RO for ORDS.
--   PART 2 (runs as SUPPORT_RO, connected automatically by SQLcl)
--     5. Defines the ORDS module /support/ with four GET handlers.
--     6. Protects the module: Basic Auth as SUPPORT_RO (database
--        authentication) and an OAuth2 client-credentials client.
--
-- How to run (SQLcl, using the ADB wallet):
--   sql /nolog
--   SQL> set cloudconfig /path/to/Wallet_<db>.zip
--   SQL> connect admin@<db>_high
--   SQL> @oracle/ords-setup.sql
--
-- Using Database Actions instead of SQLcl? Run PART 1 signed in as ADMIN,
-- then sign in as SUPPORT_RO and run PART 2 (from the CONNECT line down).
--
-- Edit the four DEFINE lines below before running. If your existing
-- tables use different names or columns, change only the SELECT lists of
-- the three views in step 2 so they return the same column aliases.
-- =====================================================================

SET DEFINE ON
SET SERVEROUTPUT ON
SET VERIFY OFF
WHENEVER SQLERROR EXIT SQL.SQLCODE

DEFINE app_schema   = SHOP
DEFINE ro_password  = "Ch4nge_Me_Long_Passphrase_2026"
DEFINE tns_alias    = mydb_high
DEFINE support_mail = support@example.com

-- =====================================================================
-- PART 1: run as ADMIN
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Demo source tables (created only when the application schema has
--    no CUSTOMERS table). They mimic a typical store schema, including
--    payment columns, so you can confirm the views do not expose them.
-- ---------------------------------------------------------------------
DECLARE
  l_count PLS_INTEGER;

  PROCEDURE run (p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  END;
BEGIN
  SELECT COUNT(*) INTO l_count FROM all_users WHERE username = UPPER('&app_schema');
  IF l_count = 0 THEN
    run('CREATE USER &app_schema NO AUTHENTICATION');
    run('ALTER USER &app_schema QUOTA 100M ON DATA');
    DBMS_OUTPUT.PUT_LINE('Created schema &app_schema (no login).');
  END IF;

  SELECT COUNT(*) INTO l_count FROM all_tables
   WHERE owner = UPPER('&app_schema') AND table_name = 'CUSTOMERS';

  IF l_count > 0 THEN
    DBMS_OUTPUT.PUT_LINE('&app_schema..CUSTOMERS exists: demo tables skipped.');
    RETURN;
  END IF;

  run(q'[CREATE TABLE &app_schema..customers (
           customer_id     VARCHAR2(20)  PRIMARY KEY,
           first_name      VARCHAR2(100) NOT NULL,
           last_name       VARCHAR2(100) NOT NULL,
           email           VARCHAR2(320) NOT NULL,
           plan_code       VARCHAR2(30)  DEFAULT 'standard' NOT NULL,
           account_status  VARCHAR2(30)  DEFAULT 'active'   NOT NULL,
           created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
           card_number     VARCHAR2(30),
           card_expiry     VARCHAR2(7),
           payment_token   VARCHAR2(200))]');
  run('CREATE UNIQUE INDEX &app_schema..customers_email_uk ON &app_schema..customers (LOWER(email))');

  run(q'[CREATE TABLE &app_schema..orders (
           order_id        VARCHAR2(20) PRIMARY KEY,
           customer_id     VARCHAR2(20) NOT NULL REFERENCES &app_schema..customers,
           order_date      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
           status          VARCHAR2(30) NOT NULL,
           total_amount    NUMBER(12,2) NOT NULL,
           currency        VARCHAR2(3)  DEFAULT 'USD' NOT NULL,
           carrier         VARCHAR2(50),
           tracking_number VARCHAR2(60),
           card_last4      VARCHAR2(4),
           billing_address VARCHAR2(400))]');
  run('CREATE INDEX &app_schema..orders_customer_ix ON &app_schema..orders (customer_id, order_date)');

  run(q'[CREATE TABLE &app_schema..order_items (
           order_id     VARCHAR2(20)  NOT NULL REFERENCES &app_schema..orders,
           line_no      NUMBER(4)     NOT NULL,
           sku          VARCHAR2(40)  NOT NULL,
           product_name VARCHAR2(200) NOT NULL,
           quantity     NUMBER(6)     NOT NULL,
           unit_price   NUMBER(12,2)  NOT NULL,
           PRIMARY KEY (order_id, line_no))]');

  run(q'[CREATE TABLE &app_schema..support_tickets (
           ticket_id      VARCHAR2(20)  PRIMARY KEY,
           customer_id    VARCHAR2(20)  NOT NULL REFERENCES &app_schema..customers,
           subject        VARCHAR2(300) NOT NULL,
           status         VARCHAR2(30)  NOT NULL,
           priority       VARCHAR2(20)  DEFAULT 'normal' NOT NULL,
           channel        VARCHAR2(20)  DEFAULT 'email'  NOT NULL,
           created_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
           updated_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
           internal_notes CLOB)]');
  run('CREATE INDEX &app_schema..tickets_customer_ix ON &app_schema..support_tickets (customer_id, created_at)');

  -- Demo rows used by tests/sample-messages.md
  run(q'[INSERT INTO &app_schema..customers VALUES
           ('C-10042', 'Ada', 'Okafor', 'ada.okafor@example.com', 'plus', 'active',
            TIMESTAMP '2024-03-14 10:12:00 +00:00', '4111111111111111', '08/28', 'tok_demo_ada')]');
  run(q'[INSERT INTO &app_schema..customers VALUES
           ('C-10077', 'Marcus', 'Lind', 'marcus.lind@example.com', 'standard', 'active',
            TIMESTAMP '2025-01-09 16:40:00 +00:00', '5555555555554444', '02/27', 'tok_demo_marcus')]');

  run(q'[INSERT INTO &app_schema..orders VALUES
           ('NW-58211', 'C-10042', SYSTIMESTAMP - INTERVAL '2' DAY, 'shipped', 129.90, 'USD',
            'UPS', '1Z999AA10123456784', '1111', '12 Harbour St, Portland OR')]');
  run(q'[INSERT INTO &app_schema..orders VALUES
           ('NW-57003', 'C-10042', SYSTIMESTAMP - INTERVAL '21' DAY, 'delivered', 54.00, 'USD',
            'USPS', '9400111899223197428490', '1111', '12 Harbour St, Portland OR')]');
  run(q'[INSERT INTO &app_schema..orders VALUES
           ('NW-58390', 'C-10077', SYSTIMESTAMP - INTERVAL '1' DAY, 'processing', 310.00, 'USD',
            NULL, NULL, '4444', '8 Elm Rd, Austin TX')]');

  run(q'[INSERT INTO &app_schema..order_items VALUES ('NW-58211', 1, 'KTL-200', 'Stovetop kettle, 2 L', 1, 89.90)]');
  run(q'[INSERT INTO &app_schema..order_items VALUES ('NW-58211', 2, 'MUG-12',  'Stoneware mug, set of 4', 1, 40.00)]');
  run(q'[INSERT INTO &app_schema..order_items VALUES ('NW-57003', 1, 'TWL-03',  'Linen tea towels, set of 3', 2, 27.00)]');
  run(q'[INSERT INTO &app_schema..order_items VALUES ('NW-58390', 1, 'CHR-01',  'Oak dining chair', 2, 155.00)]');

  run(q'[INSERT INTO &app_schema..support_tickets VALUES
           ('T-3301', 'C-10042', 'Kettle lid is loose', 'resolved', 'normal', 'email',
            SYSTIMESTAMP - INTERVAL '40' DAY, SYSTIMESTAMP - INTERVAL '38' DAY,
            'Internal: customer was rude on the phone. Do not expose.')]');

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Created demo tables and rows in &app_schema..');
END;
/

-- ---------------------------------------------------------------------
-- 2. Support-safe views. These are the ONLY objects SUPPORT_RO can read.
--    Column aliases are the API contract; keep them if you remap columns.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW &app_schema..support_customers_v AS
SELECT c.customer_id,
       c.first_name || ' ' || c.last_name                  AS full_name,
       LOWER(c.email)                                      AS email,
       c.plan_code                                         AS plan,
       c.account_status                                    AS status,
       TO_CHAR(SYS_EXTRACT_UTC(c.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
  FROM &app_schema..customers c;

CREATE OR REPLACE VIEW &app_schema..support_orders_v AS
SELECT o.order_id,
       o.customer_id,
       TO_CHAR(SYS_EXTRACT_UTC(o.order_date), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS order_date,
       o.order_date                                        AS order_ts,
       o.status,
       o.total_amount                                      AS total,
       o.currency,
       o.carrier,
       o.tracking_number,
       (SELECT JSON_ARRAYAGG(
                 JSON_OBJECT('sku'      VALUE i.sku,
                             'name'     VALUE i.product_name,
                             'quantity' VALUE i.quantity)
                 ORDER BY i.line_no RETURNING CLOB)
          FROM &app_schema..order_items i
         WHERE i.order_id = o.order_id)                    AS items_json
  FROM &app_schema..orders o;

CREATE OR REPLACE VIEW &app_schema..support_tickets_v AS
SELECT t.ticket_id,
       t.customer_id,
       t.subject,
       t.status,
       t.priority,
       t.channel,
       TO_CHAR(SYS_EXTRACT_UTC(t.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
       TO_CHAR(SYS_EXTRACT_UTC(t.updated_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
       t.created_at                                        AS created_ts
  FROM &app_schema..support_tickets t;          -- internal_notes is deliberately excluded

-- ---------------------------------------------------------------------
-- 3. Read-only API user: CREATE SESSION + SELECT on the three views.
-- ---------------------------------------------------------------------
DECLARE
  l_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO l_count FROM all_users WHERE username = 'SUPPORT_RO';
  IF l_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER support_ro IDENTIFIED BY "&ro_password"';
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER support_ro IDENTIFIED BY "&ro_password" ACCOUNT UNLOCK';
  END IF;
END;
/

GRANT CREATE SESSION TO support_ro;
GRANT SELECT ON &app_schema..support_customers_v TO support_ro;
GRANT SELECT ON &app_schema..support_orders_v    TO support_ro;
GRANT SELECT ON &app_schema..support_tickets_v   TO support_ro;
-- No quota, no CREATE TABLE, no INSERT/UPDATE/DELETE, no access to base tables.
ALTER USER support_ro QUOTA 0 ON data;

-- ---------------------------------------------------------------------
-- 4. REST-enable SUPPORT_RO. URLs become https://<host>/ords/support_ro/...
--    p_auto_rest_auth => TRUE keeps AutoREST (if ever used) behind auth.
-- ---------------------------------------------------------------------
BEGIN
  ORDS_ADMIN.ENABLE_SCHEMA(
    p_enabled             => TRUE,
    p_schema              => 'SUPPORT_RO',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'support_ro',
    p_auto_rest_auth      => TRUE);
  COMMIT;
END;
/

-- =====================================================================
-- PART 2: run as SUPPORT_RO
-- =====================================================================
CONNECT support_ro/"&ro_password"@&tns_alias

-- ---------------------------------------------------------------------
-- 5. ORDS module /support/ with four read-only GET handlers.
--    Collection handlers page natively: ?limit=5 returns at most 5 rows.
-- ---------------------------------------------------------------------
BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'support.v1',
    p_base_path      => '/support/',
    p_items_per_page => 5,
    p_status         => 'PUBLISHED',
    p_comments       => 'Read-only customer lookup for the n8n support workflow');

  -- Liveness check, used when the workflow skips a customer lookup.
  ORDS.DEFINE_TEMPLATE(p_module_name => 'support.v1', p_pattern => 'health');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'support.v1',
    p_pattern     => 'health',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_item,
    p_source      => q'[SELECT 'ok' AS status FROM dual]');

  -- GET /support/customers/by-email/{email}
  ORDS.DEFINE_TEMPLATE(p_module_name => 'support.v1', p_pattern => 'customers/by-email/:email');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'support.v1',
    p_pattern     => 'customers/by-email/:email',
    p_method      => 'GET',
    p_source_type => ORDS.source_type_collection_item,   -- one JSON object, 404 when no row
    p_source      => q'[
      SELECT customer_id, full_name, email, plan, status, created_at
        FROM &app_schema..support_customers_v
       WHERE email = LOWER(TRIM(:email))]');

  -- GET /support/customers/{customer_id}/orders?limit=5
  ORDS.DEFINE_TEMPLATE(p_module_name => 'support.v1', p_pattern => 'customers/:customer_id/orders');
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'support.v1',
    p_pattern        => 'customers/:customer_id/orders',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_collection_feed,
    p_items_per_page => 5,
    -- The "{}items" alias makes ORDS emit the JSON array as nested JSON.
    p_source         => q'[
      SELECT order_id, order_date, status, total, currency, carrier,
             tracking_number, items_json AS "{}items"
        FROM &app_schema..support_orders_v
       WHERE customer_id = :customer_id
       ORDER BY order_ts DESC]');

  -- GET /support/customers/{customer_id}/tickets?limit=5
  ORDS.DEFINE_TEMPLATE(p_module_name => 'support.v1', p_pattern => 'customers/:customer_id/tickets');
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'support.v1',
    p_pattern        => 'customers/:customer_id/tickets',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_collection_feed,
    p_items_per_page => 5,
    p_source         => q'[
      SELECT ticket_id, subject, status, priority, channel, created_at, updated_at
        FROM &app_schema..support_tickets_v
       WHERE customer_id = :customer_id
       ORDER BY created_ts DESC]');

  COMMIT;
END;
/

-- ---------------------------------------------------------------------
-- 6. Protect every /support/* URL.
--    - Basic Auth: ORDS database authentication gives a REST-enabled
--      schema user the "SQL Developer" role when it signs in with its own
--      password, so SUPPORT_RO/<password> works with n8n Basic Auth.
--    - OAuth2: a client-credentials client holding support_api_role.
--      Use this if you prefer not to hand the database password to n8n.
-- ---------------------------------------------------------------------
DECLARE
  l_roles    OWA.VC_ARR;
  l_patterns OWA.VC_ARR;
  l_modules  OWA.VC_ARR;
BEGIN
  -- Make the script re-runnable: drop the client and role if they exist.
  BEGIN OAUTH.DELETE_CLIENT(p_name => 'n8n-support-workflow'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_PRIVILEGE(p_name => 'support.v1.read');   EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_ROLE(p_role_name => 'support_api_role');   EXCEPTION WHEN OTHERS THEN NULL; END;

  ORDS.CREATE_ROLE(p_role_name => 'support_api_role');

  l_roles(1)    := 'SQL Developer';
  l_roles(2)    := 'support_api_role';
  l_patterns(1) := '/support/*';

  ORDS.DEFINE_PRIVILEGE(
    p_privilege_name => 'support.v1.read',
    p_roles          => l_roles,
    p_patterns       => l_patterns,
    p_modules        => l_modules,
    p_label          => 'Support API (read-only)',
    p_description    => 'Read customer profile, recent orders and tickets for support replies',
    p_comments       => 'Used by the n8n dual-LLM support workflow');

  OAUTH.CREATE_CLIENT(
    p_name            => 'n8n-support-workflow',
    p_grant_type      => 'client_credentials',
    p_owner           => 'Support automation',
    p_description     => 'n8n workflow that drafts support replies',
    p_support_email   => '&support_mail',
    p_privilege_names => 'support.v1.read');

  OAUTH.GRANT_CLIENT_ROLE(
    p_client_name => 'n8n-support-workflow',
    p_role_name   => 'support_api_role');

  COMMIT;
END;
/

-- Show the OAuth client id/secret (copy them into an n8n OAuth2 credential
-- if you chose OAuth2; token URL: <ORACLE_ORDS_BASE_URL>/oauth/token).
SELECT name, client_id, client_secret
  FROM user_ords_clients
 WHERE name = 'n8n-support-workflow';

PROMPT
PROMPT Done. Test with:
PROMPT   curl -u SUPPORT_RO:<password> https://<host>/ords/support_ro/support/health
PROMPT   curl -u SUPPORT_RO:<password> https://<host>/ords/support_ro/support/customers/by-email/ada.okafor%40example.com
PROMPT   curl -u SUPPORT_RO:<password> "https://<host>/ords/support_ro/support/customers/C-10042/orders?limit=5"
PROMPT   curl -u SUPPORT_RO:<password> "https://<host>/ords/support_ro/support/customers/C-10042/tickets?limit=5"
