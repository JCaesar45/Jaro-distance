function jaro(s, t) {
    let len1 = s.length;
    let len2 = t.length;
    
    // If both strings are empty, the distance is 1 (exact match)
    if (len1 === 0 && len2 === 0) {
        return 1;
    }
    
    // Maximum distance for matching characters
    let matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    if (matchDistance < 0) matchDistance = 0;
    
    // Arrays to keep track of matched characters
    let sMatches = new Array(len1).fill(false);
    let tMatches = new Array(len2).fill(false);
    
    let matches = 0;
    
    // Find matching characters
    for (let i = 0; i < len1; i++) {
        let start = Math.max(0, i - matchDistance);
        let end = Math.min(i + matchDistance + 1, len2);
        
        for (let j = start; j < end; j++) {
            if (tMatches[j] || s[i] !== t[j]) continue;
            sMatches[i] = true;
            tMatches[j] = true;
            matches++;
            break;
        }
    }
    
    // If there are no matches, the distance is 0
    if (matches === 0) return 0;
    
    // Count transpositions
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!sMatches[i]) continue;
        while (!tMatches[k]) k++;
        if (s[i] !== t[k]) transpositions++;
        k++;
    }
    
    // t is half the number of transpositions
    let tVal = transpositions / 2;
    
    // Calculate and return the Jaro distance
    return (matches / len1 + matches / len2 + (matches - tVal) / matches) / 3;
}
