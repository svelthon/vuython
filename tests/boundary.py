# A module whose functions another component calls with its own Python values.
def describe(value):
    return type(value).__name__


def mark(value):
    value["seen"] = True
