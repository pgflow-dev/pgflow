/* eslint-disable */
type StepOptions = {
	dependencies?: string[];
	queue?: string;
};

function defineStep(name: string, options: StepOptions, handler: Function) {}

// digraph nlp_pipeline {
//     "openai_embeddings" -> "huggingface";
//     "huggingface" -> "langchain_processing";
//     "langchain_processing" -> "bert";
//     "bert" -> "sentiment";
//     "bert" -> "ner";
//     "ner" -> "topic";
//     "topic" -> "keyword";
//     "keyword" -> "text_class";
//     "text_class" -> "result_aggregation";
// }

defineStep('openai_embeddings', {}, async () => {
	console.log('openai_embeddings');
});

defineStep('huggingface', { dependencies: ['openai_embeddings'] }, async () => {
	console.log('huggingface');
});

defineStep('langchain_processing', { dependencies: ['huggingface'] }, async () => {
	console.log('langchain_processing');
});

defineStep('bert', {}, async () => {
	console.log('bert');
});

defineStep('sentiment', { dependencies: ['bert'] }, async () => {
	console.log('sentiment');
});

defineStep('ner', { dependencies: ['bert'] }, async () => {
	console.log('ner');
});

defineStep('topic', { dependencies: ['ner'] }, async () => {
	console.log('topic');
});

defineStep('keyword', { dependencies: ['topic'] }, async () => {
	console.log('keyword');
});
