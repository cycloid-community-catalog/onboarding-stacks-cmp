resource "google_sql_database" "database" {
  name     = local.database_name
  instance = google_sql_database_instance.postgresql.name
}