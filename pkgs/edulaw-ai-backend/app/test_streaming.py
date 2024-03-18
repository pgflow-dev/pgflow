from langserve.client import RemoteRunnable;
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_template("Tell me a joke about {topic}")
model = RemoteRunnable("http://localhost:8081/models/ChatOpenAI")
chain = prompt.pipe(model)

stream = chain.stream({'topic': 'cats'})
for chunk in stream:
    print(chunk)
