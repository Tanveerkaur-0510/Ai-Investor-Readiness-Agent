def adjust_classification(scores):
    avg = sum(scores.values()) / len(scores)

    if avg >= 8:
        return "Ready"
    elif avg >= 5:
        return "Needs Work"
    else:
        return "High Risk"