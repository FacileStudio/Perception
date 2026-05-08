# Research References

Parent: [[../auto-labeling]]
Related: [[overview]], [[ontology]], [[workflow]], [[evaluation]]

## Takeaways

The research supports a hybrid approach:

- ontology learning is usually semi-automatic, not blind full automation
- schema/ontology matching benefits from background knowledge
- entity resolution needs explainability, active learning, and human review for uncertain matches
- RAG evaluation needs retrieval and generation metrics, not just answer vibes
- GraphRAG-style entity graphs and summaries help broad sensemaking questions
- structured outputs are useful for reliable schema-constrained inference

## Sources

- Biemann, "Ontology Learning from Text: A Survey of Methods" — ontology learning is a layered/semi-automatic extraction problem, not just label generation. https://jlcl.org/article/view/76
- Brizan and Tansel, "A Survey of Entity Resolution and Record Linkage Methodologies" — entity resolution links fragmented representations of real-world things and requires data cleansing/schema integration discipline. https://scholarworks.lib.csusb.edu/ciima/vol6/iss3/5/
- IBM Research, "SystemER: A human-in-the-loop system for explainable entity resolution" — practical ER benefits from human-comprehensible rules, active learning, and explainability. https://research.ibm.com/publications/systemer-a-humanintheloop-system-for-explainable-entity-resolution
- IBM Research, "Learning-based methods with human-in-the-loop for entity resolution" — modern ER should combine automation, minimal human labels, and explainability. https://research.ibm.com/publications/learning-based-methods-with-human-in-the-loop-for-entity-resolution
- Portisch, Hladik, Paulheim, "Background knowledge in ontology matching: A survey" — schema/ontology matching needs background knowledge because source semantics are incomplete. https://doi.org/10.3233/SW-223085
- Shahul Es et al., "RAGAS: Automated Evaluation of Retrieval Augmented Generation" — evaluate retrieval context quality, faithfulness, and answer relevance, not only final prose. https://huggingface.co/papers/2309.15217
- Saad-Falcon et al., "ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems" — RAG evaluation can use model judges with human-annotated anchors across context relevance, answer faithfulness, and answer relevance. https://huggingface.co/papers/2311.09476
- Edge et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" — broad/global questions need entity graphs and summaries, not only nearest-neighbor retrieval. https://www.microsoft.com/en-us/research/publication/from-local-to-global-a-graph-rag-approach-to-query-focused-summarization/
- Anthropic Claude structured outputs — ontology inference should use schema-constrained output instead of freeform JSON hopes and prayers. https://docs.claude.com/en/docs/build-with-claude/structured-outputs
- AI SDK structured object generation — TypeScript implementation can validate generated objects with schemas. https://v5.ai-sdk.dev/docs/reference/ai-sdk-core/generate-object
