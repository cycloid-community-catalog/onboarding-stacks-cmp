resource "google_sql_user" "user" {
  name     = local.database_user
  instance = google_sql_database_instance.postgresql.name
  password = random_password.db.result
} 