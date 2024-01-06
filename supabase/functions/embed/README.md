# embed

Test it with this curl (make sure to replace ANON_KEY):

```sh
curl --request POST 'http://localhost:54321/functions/v1/embed' \
        --header 'Authorization: Bearer ANON_KEY' \
        --header 'Content-Type: application/json' \
        --data '{ "input": "hello world" }'
```
