import os
import requests
from datetime import datetime
from pydantic import BaseModel, Field

from supabase.client import create_client, Client, ClientOptions


def last_5_notes():
    options = ClientOptions(schema="feed")
    client = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"], options
    )
    # client.auth.set_session(access_token=auth_token, refresh_token='')

    return client.table("notes").select("*").execute()


class Tools:
    class Valves(BaseModel):
        supabase_key: str = Field(default=os.environ("SUPABASE_KEY"))
        supabase_url: str = Field(default=os.environ("SUPABASE_URL"))

    def __init__(self):
        self.valves = self.Valves()
        pass

    def search_my_recent_activity(self, query: str) -> str:
        """
        Returns array of my recent activity - find notes that matches query and are recent.

        :param query: The search query used to retrieve relevant notes.
        :returns: List of my recent notes, as a string
        """

        try:
            response = last_5_notes()

            if response.data:
                return "My recent notes matching query: \n" + "\n".join(response.data)
            else:
                return "Cannnot find any notes at all!"

        except Exception as e:
            return f"Error fetching recent notes data: {str(e)}"
