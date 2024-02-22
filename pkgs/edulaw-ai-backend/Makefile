.PHONY: test watch server

HTTP_PORT ?= 8080

test:
	pdm run pytest --verbose --color=yes lex_parser/*_test.py

watch:
	ls lex_parser/* | entr -rc make test

server:
	pdm run langchain serve --port $(HTTP_PORT)
