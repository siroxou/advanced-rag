output "cluster_endpoint" {
  description = "GKE control-plane endpoint"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "postgres_connection_name" {
  description = "Cloud SQL connection name for the proxy"
  value       = google_sql_database_instance.postgres.connection_name
}
