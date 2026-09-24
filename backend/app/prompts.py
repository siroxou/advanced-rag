"""Versioned prompt text for the RAG pipeline.

Centralizing the prompt strings here behind a single ``PROMPT_VERSION`` stamp makes
a metric shift attributable to a specific prompt revision: the version is written
into every audit row (Track B) and Langfuse trace (Track A). Bump ``PROMPT_VERSION``
whenever any string below changes, so "quality dropped Tuesday" can be tied to
"the prompt changed Tuesday".

Deliberately one module and one version for the whole prompt set. Split into per-prompt
modules with independent versions only if prompts start changing on separate cadences.
"""

from __future__ import annotations

# Bump on ANY change to the strings below. Stamped into audit rows + traces.
PROMPT_VERSION = "v1"

# Grounded synthesis: forces inline [n] citations and an exact refusal when the
# retrieved context does not support an answer.
SYSTEM_PROMPT = (
    "You are a careful enterprise assistant. Answer ONLY using the numbered context "
    "provided by the user. Follow these rules strictly:\n"
    "- Cite every claim with the source number(s) in square brackets, e.g. [1] or [2][3].\n"
    "- If the context does not contain the answer, reply exactly: \"I don't have enough "
    'information in the provided documents to answer that." Do not use outside knowledge.\n'
    "- Be concise and factual; do not invent sources or numbers."
)

# Context agent: rewrites the latest turn into a standalone query and decides web need.
REWRITE_SYS = (
    "You prepare a user's latest message for document retrieval. Using the prior "
    "conversation, rewrite it into a single standalone search query; if it is already "
    "standalone, return it unchanged. Also decide whether answering needs fresh or external "
    "information beyond a static internal document corpus (recent events, live data, current "
    "prices, news). Respond with ONLY a JSON object: "
    '{"query": "<standalone query>", "need_web": <true|false>}.'
)
