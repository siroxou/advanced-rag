# Capability artifact (see ADR-0004): a real GKE + GPU + managed-Postgres topology,
# committed and CI-validated (`terraform validate`), not applied to a paid cluster.
# The live demo runs cheaply on Vercel + Modal + Neon instead.

resource "google_container_cluster" "primary" {
  name                     = var.cluster_name
  location                 = var.region
  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = false
}

resource "google_container_node_pool" "general" {
  name       = "general"
  cluster    = google_container_cluster.primary.id
  node_count = 2

  node_config {
    machine_type = "e2-standard-2"
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
}

# GPU pool for vLLM. Scales to zero so it costs nothing while idle.
resource "google_container_node_pool" "gpu" {
  name    = "gpu"
  cluster = google_container_cluster.primary.id

  autoscaling {
    min_node_count = 0
    max_node_count = 2
  }

  node_config {
    machine_type = "g2-standard-8"
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    guest_accelerator {
      type  = var.gpu_type
      count = 1
    }

    taint {
      key    = "nvidia.com/gpu"
      value  = "present"
      effect = "NO_SCHEDULE"
    }
  }
}

resource "google_sql_database_instance" "postgres" {
  name                = "${var.cluster_name}-pg"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = false

  settings {
    tier = var.db_tier
  }
}

# pgvector is enabled in-database with `CREATE EXTENSION vector;` after creation
# (Cloud SQL Postgres 15+ ships the extension).
resource "google_sql_database" "rag" {
  name     = "rag"
  instance = google_sql_database_instance.postgres.name
}
