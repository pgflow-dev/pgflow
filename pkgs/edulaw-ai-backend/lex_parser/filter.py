
def create_metadata_filter(**meta):
    """Creates a lambda that compares doc metadata with given values"""
    return lambda doc: all(
        key in doc.metadata and doc.metadata[key] == value 
        for key, value in meta.items()
    )

