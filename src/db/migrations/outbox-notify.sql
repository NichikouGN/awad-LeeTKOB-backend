CREATE OR REPLACE FUNCTION notify_outbox_event_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('outbox_event_created', NEW.outbox_event_id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbox_event_created_notify ON outbox_events;
CREATE TRIGGER outbox_event_created_notify
AFTER INSERT ON outbox_events
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION notify_outbox_event_created();
