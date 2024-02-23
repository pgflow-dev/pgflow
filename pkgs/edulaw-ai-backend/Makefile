.PHONY: test watch server

HTTP_PORT ?= 8080

include ./.env

test:
	@pdm run pytest --verbose --color=yes lex_parser/*_test.py

watch:
	@ls lex_parser/* | entr -rc make test

server:
	@pdm run langchain serve --port $(HTTP_PORT)
