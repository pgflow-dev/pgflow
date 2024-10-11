import os

from supabase.client import Client, create_client


def create_service_role_client() -> Client:
    return create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
