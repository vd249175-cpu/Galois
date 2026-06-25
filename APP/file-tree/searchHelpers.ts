export function tokenizeQuery(query: string) {
  const regex = /(#re:\S+|re:\S+|\(|\)|#\/[^\/]+\/[a-z]*|#[^\s()#]+|and|add|or|not|&&|\|\||!|\S+)/gi;
  const rawTokens = query.match(regex) || [];
  
  const tokens: { type: 'tag' | 'operator' | 'filename'; value: string }[] = [];
  
  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (lower === '(' || lower === ')') {
      tokens.push({ type: 'operator', value: token });
    } else if (lower === 'and' || lower === '&&' || lower === 'add') {
      tokens.push({ type: 'operator', value: '&' });
    } else if (lower === 'or' || lower === '||') {
      tokens.push({ type: 'operator', value: '|' });
    } else if (lower === 'not' || lower === '!') {
      tokens.push({ type: 'operator', value: '!' });
    } else if (token.startsWith('#')) {
      if (token.startsWith('#/') || token.startsWith('#re:')) {
        tokens.push({ type: 'tag', value: token });
      } else {
        const parts = token.split('#').filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) {
            tokens.push({ type: 'operator', value: '&' });
          }
          tokens.push({ type: 'tag', value: '#' + parts[i] });
        }
      }
    } else {
      tokens.push({ type: 'filename', value: token });
    }
  }
  
  return tokens;
}

export function evaluateBoolean(tokens: string[]): boolean {
  const outputQueue: string[] = [];
  const operatorStack: string[] = [];
  
  const precedence: Record<string, number> = {
    '|': 1,
    '&': 2,
    '!': 3
  };

  for (const token of tokens) {
    if (token === 'true' || token === 'false') {
      outputQueue.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.pop();
    } else if (token === '&' || token === '|' || token === '!') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    }
  }

  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop()!);
  }

  const stack: boolean[] = [];
  for (const token of outputQueue) {
    if (token === 'true') {
      stack.push(true);
    } else if (token === 'false') {
      stack.push(false);
    } else if (token === '!') {
      const val = stack.pop();
      if (val === undefined) return false;
      stack.push(!val);
    } else if (token === '&') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return false;
      stack.push(a && b);
    } else if (token === '|') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return false;
      stack.push(a || b);
    }
  }

  return stack[0] || false;
}

export function checkSingleTagMatch(fileTags: string[], tagQuery: string): boolean {
  let isRegex = false;
  let pattern = '';
  let flags = 'i';

  if (tagQuery.startsWith('#re:')) {
    isRegex = true;
    pattern = tagQuery.slice(4);
  } else if (tagQuery.startsWith('#/')) {
    const lastSlash = tagQuery.lastIndexOf('/');
    pattern = tagQuery.slice(2, lastSlash);
    flags = tagQuery.slice(lastSlash + 1) || 'i';
    isRegex = true;
  } else {
    // Auto-detect regex if common metacharacters are present (excluding ? and . to prevent false positives)
    const plainTag = tagQuery.slice(1); // strip '#'
    const regexMetachars = /[\^$()\[\]{}*+|\\]/;
    if (regexMetachars.test(plainTag)) {
      isRegex = true;
      pattern = plainTag;
    } else {
      pattern = plainTag;
    }
  }

  if (isRegex) {
    try {
      const re = new RegExp(pattern, flags.includes('i') ? flags : flags + 'i');
      return fileTags.some(t => re.test(t));
    } catch {
      return fileTags.some(t => t.toLowerCase().includes(pattern.toLowerCase()));
    }
  } else {
    return fileTags.some(t => t.toLowerCase().includes(pattern.toLowerCase()));
  }
}

export function matchesTagQuery(fileTags: string[], tagTokens: { type: 'tag' | 'operator'; value: string }[]): boolean {
  if (tagTokens.length === 0) return true;

  const exprTokens: string[] = [];
  for (let i = 0; i < tagTokens.length; i++) {
    const current = tagTokens[i];
    if (i > 0) {
      const prev = tagTokens[i - 1];
      const prevIsOperand = prev.value === ')' || prev.type === 'tag';
      const currentIsOperand = current.value === '(' || current.value === '!' || current.type === 'tag';
      if (prevIsOperand && currentIsOperand) {
        exprTokens.push('&');
      }
    }
    
    if (current.type === 'tag') {
      const isMatch = checkSingleTagMatch(fileTags, current.value);
      exprTokens.push(isMatch ? 'true' : 'false');
    } else {
      exprTokens.push(current.value);
    }
  }

  return evaluateBoolean(exprTokens);
}

export function matchesFilename(filename: string, filenameTokens: string[]): boolean {
  if (filenameTokens.length === 0) return true;
  const displayName = filename.endsWith('.md') ? filename.substring(0, filename.lastIndexOf('.md')) : filename;
  const nameLower = displayName.toLowerCase();
  return filenameTokens.every(token => {
    let isRegex = false;
    let pattern = '';
    let flags = 'i';

    if (token.startsWith('re:')) {
      isRegex = true;
      pattern = token.slice(3);
    } else if (/^\/.*\/\w*$/.test(token)) {
      const lastSlash = token.lastIndexOf('/');
      pattern = token.slice(1, lastSlash);
      flags = token.slice(lastSlash + 1) || 'i';
      isRegex = true;
    } else {
      // Auto-detect regex if common metacharacters are present (excluding ? and . to prevent false positives)
      const regexMetachars = /[\^$()\[\]{}*+|\\]/;
      if (regexMetachars.test(token)) {
        isRegex = true;
        pattern = token;
      }
    }

    if (isRegex) {
      try {
        const re = new RegExp(pattern, flags.includes('i') ? flags : flags + 'i');
        return re.test(displayName);
      } catch {
        return nameLower.includes(pattern.toLowerCase());
      }
    }
    return nameLower.includes(token.toLowerCase());
  });
}
