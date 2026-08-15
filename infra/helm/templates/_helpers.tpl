{{/* Usage: include "advanced-rag.image" (dict "root" $ "repository" .Values.backend.repository) */}}
{{- define "advanced-rag.image" -}}
{{ .root.Values.image.registry }}/{{ .repository }}:{{ .root.Values.image.tag }}
{{- end -}}

{{- define "advanced-rag.labels" -}}
app.kubernetes.io/name: advanced-rag
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: advanced-rag-{{ .Chart.Version }}
{{- end -}}
