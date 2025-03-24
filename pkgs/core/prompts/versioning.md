# Versioning

Flow Versioning Strategy #[[pgflow/Versioning]]
Agreed on immutable flow definitions (similar to Temporal)
Once a flow is uploaded to DB, it remains unchanged
Versioning handled through flow slugs rather than explicit version numbers
Users responsible for managing changes in safe, organized manner
Benefits of immutable approach
Simplifies implementation
Provides natural versioning cascade for subflows
Makes version transitions explicit and intentional
Avoids "half-upgraded" scenarios
Consciously decided against "latest" aliases for now
Could introduce complexity and unpredictable behavior
Users can implement their own aliasing logic if needed
Explicit slugs provide clarity about which version is being used
