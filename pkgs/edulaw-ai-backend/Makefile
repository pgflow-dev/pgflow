.PHONY: test watch

test:
	poetry run pytest --verbose --color=yes lex_parser/*_test.py

watch:
	ls lex_parser/* | entr -rc make test
