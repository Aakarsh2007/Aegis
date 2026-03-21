def process_data():
    print("Starting data processing...")
    is_processing = True
    count = 0
    
    try:
        while is_processing:
            count += 1
            if count == 100:
                print("Data processed.")
                is_processing = False # Terminate the loop
    finally:
        # Explicitly dereference local variables to ensure they are eligible for
        # garbage collection as soon as possible. While often redundant for simple
        # types and Python's default scope management, this can act as a defensive
        # measure in scenarios where variables might unexpectedly hold references
        # to larger objects or external resources that need prompt release.
        if 'is_processing' in locals():
            del is_processing
        if 'count' in locals():
            del count

process_data()