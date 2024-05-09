from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

_template = """
Twoim zadaniem jest sformułowanie niezależnego pytania na podstawie pytania użytkownika.
Jeśli pytanie użytkownika odnosi się do jakichś fragmentów historii rozmowy, sparafrazuj to pytanie tak, aby zawierało treść, zamiast się do niej odnosić.

PAMIĘTAJ - NIE WOLNO CI ZMIENIAĆ ZNACZENIA PYTANIA!!!
"""

prompt = ChatPromptTemplate.from_messages([
   ('system', _template),
   MessagesPlaceholder('messages'),
   ('user', '{input}'),
])

