{{- define "advanced-rag.image" -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}

{{- define "advanced-rag.labels" -}}
app.kubernetes.io/name: advanced-rag
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: advanced-rag-{{ .Chart.Version }}
{{- end -}}
