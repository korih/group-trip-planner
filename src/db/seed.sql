-- Seed data for local development

INSERT INTO users (id, name, email) VALUES
  ('user-001', 'Alice Johnson', 'alice@example.com'),
  ('user-002', 'Bob Smith', 'bob@example.com'),
  ('user-003', 'Carol White', 'carol@example.com');

INSERT INTO trips (id, name, description, destination, start_date, end_date, created_by, status) VALUES
  ('trip-001', 'Tokyo Adventure', 'A group trip to explore Tokyo and surrounding areas', 'Tokyo, Japan', '2025-04-01', '2025-04-10', 'user-001', 'planning');

INSERT INTO trip_members (trip_id, user_id, role) VALUES
  ('trip-001', 'user-001', 'owner'),
  ('trip-001', 'user-002', 'member'),
  ('trip-001', 'user-003', 'member');

INSERT INTO itinerary_items (id, trip_id, title, description, location, item_date, start_time, end_time, category, estimated_cost, created_by) VALUES
  ('item-001', 'trip-001', 'Arrive at Narita Airport', 'Flight arrival and transfer to hotel', 'Narita International Airport', '2025-04-01', '14:00', '16:00', 'transport', 0, 'user-001'),
  ('item-002', 'trip-001', 'Check-in at Shinjuku Hotel', NULL, 'Shinjuku, Tokyo', '2025-04-01', '16:00', '17:00', 'accommodation', 150, 'user-001'),
  ('item-003', 'trip-001', 'Explore Shibuya Crossing', 'Visit the famous scramble crossing and surrounding shops', 'Shibuya, Tokyo', '2025-04-02', '10:00', '14:00', 'activity', 0, 'user-001');
