variable "project_id" {
  description = "GCP project id"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "cluster_name" {
  description = "GKE cluster name"
  type        = string
  default     = "advanced-rag"
}

variable "gpu_type" {
  description = "Accelerator for the vLLM node pool"
  type        = string
  default     = "nvidia-l4"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-2-7680"
}
